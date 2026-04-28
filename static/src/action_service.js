import { _t } from '@web/core/l10n/translation';
import { browser } from '@web/core/browser/browser';
import { makeContext } from '@web/core/context';
import { useDebugCategory } from '@web/core/debug/debug_context';
import { evaluateExpr } from '@web/core/py_js/py';
import { rpc, rpcBus } from '@web/core/network/rpc';
import { registry } from '@web/core/registry';
import { user } from '@web/core/user';
import { Deferred, KeepLast } from '@web/core/utils/concurrency';
import { useBus, useService } from '@web/core/utils/hooks';
import { View, ViewNotFoundError } from '@web/views/view';
import { ActionDialog } from '@web/webclient/actions/action_dialog';
import { ReportAction } from '@web/webclient/actions/reports/report_action';
import { UPDATE_METHODS } from '@web/core/orm_service';
import { CallbackRecorder } from '@web/search/action_hook';
import { ControlPanel } from '@web/search/control_panel/control_panel';
import {
  PATH_KEYS,
  router as _router,
  stateToUrl,
} from '@web/core/browser/router';
import {
  Component,
  markup,
  onMounted,
  onWillUnmount,
  onError,
  useChildSubEnv,
  xml,
  reactive,
  status,
  useSubEnv,
} from '@odoo/owl';
import { downloadReport, getReportUrl } from '@web/webclient/actions/reports/utils';
import { zip } from '@web/core/utils/arrays';
// Local implementation of isHtmlEmpty for Odoo 18 compatibility
const isHtmlEmpty = (html) => !html || html.toString().trim() === "" || html.toString().trim() === "<p><br></p>";
import { omit, pick, shallowEqual } from '@web/core/utils/objects';
import { session } from '@web/session';
import { exprToBoolean } from '@web/core/utils/strings';
import { clearUncommittedChanges, standardActionServiceProps, ControllerNotFoundError, InvalidButtonParamsError } from '@web/webclient/actions/action_service';

class BlankComponent extends Component {
  static props = ['onMounted', 'withControlPanel', '*'];
  static template = xml`
        <ControlPanel display="{disableDropdown: true}" t-if="props.withControlPanel and !env.isSmall">
            <t t-set-slot="layout-buttons">
                <button class="btn btn-primary invisible"> empty </button>
            </t>
        </ControlPanel>`;
  static components = { ControlPanel };

  setup() {
    useChildSubEnv({ config: { breadcrumbs: [], noBreadcrumbs: true } });
    onMounted(() => this.props.onMounted());
  }
}

const actionHandlersRegistry = registry.category('action_handlers');
const actionRegistry = registry.category('actions');

// Global state for tabs that persists across component re-mounts
export const globalTabState = reactive({
    action_infos: [],
    controllerStacks: {},
    count: 0,
});

export function makeActionManager(env, router = _router) {
  const breadcrumbCache = {};
  
  router.hideKeyFromUrl('globalState');

  env.bus.addEventListener('CLEAR-CACHES', () => {
    actionCache = {};
  });
  rpcBus.addEventListener('RPC:RESPONSE', (ev) => {
    const { model, method } = ev.detail.data.params;
    if (
      model === 'ir.actions.act_window' &&
      UPDATE_METHODS.includes(method)
    ) {
      actionCache = {};
    }
  });

  const keepLast = new KeepLast();
  let id = 0;
  let controllerStack = [];
  let dialogCloseProm;
  let actionCache = {};
  let dialog = null;
  let nextDialog = null;

  async function _controllersFromState() {
    const state = router.current;
    if (!state?.actionStack?.length) return [];
    const controllers = state.actionStack.slice(0, -1).map((actionState, index) => {
        const controller = _makeController({
          displayName: actionState.displayName,
          virtual: true,
          action: {},
          props: {},
          state: { ...actionState, actionStack: state.actionStack.slice(0, index + 1) },
          currentState: {},
        });
        // ... abbreviated logic ...
        return controller;
      }).filter(Boolean);
    return _loadBreadcrumbs(controllers);
  }

  async function _loadBreadcrumbs(controllers) {
    const toFetch = [];
    const keys = [];
    for (const { action, state, displayName } of controllers) {
      const actionInfo = pick(state, 'action', 'model', 'resId');
      const key = JSON.stringify(actionInfo);
      keys.push(key);
      if (displayName) breadcrumbCache[key] = { display_name: displayName };
      if (key in breadcrumbCache) continue;
      toFetch.push(actionInfo);
    }
    if (toFetch.length) {
      const req = rpc('/web/action/load_breadcrumbs', { actions: toFetch });
      for (const [i, info] of toFetch.entries()) {
        const key = JSON.stringify(info);
        breadcrumbCache[key] = req.then((res) => { breadcrumbCache[key] = res[i]; return res[i]; });
      }
    }
    const results = await Promise.all(keys.map((k) => breadcrumbCache[k]));
    for (const [controller, res] of zip(controllers, results)) {
      if ('display_name' in res) controller.displayName = res.display_name;
    }
    return controllers;
  }

  function _removeDialog() {
    if (dialog) {
      const { onClose, remove } = dialog;
      dialog = null;
      remove();
      return onClose;
    }
  }

  function _getCurrentController() {
    return controllerStack.length ? controllerStack[controllerStack.length - 1] : null;
  }

  async function _loadAction(actionRequest, context = {}) {
    if (typeof actionRequest === 'string' && actionRegistry.contains(actionRequest)) {
      return { target: 'current', tag: actionRequest, type: 'ir.actions.client' };
    }
    if (typeof actionRequest === 'string' || typeof actionRequest === 'number') {
      const ctx = makeContext([user.context, context]);
      const key = `${JSON.stringify(actionRequest)},${JSON.stringify(ctx)}`;
      let action = await actionCache[key];
      if (!action) {
        actionCache[key] = rpc('/web/action/load', { action_id: actionRequest, context: ctx });
        action = await actionCache[key];
        if (action.help) action.help = markup(action.help);
      }
      return Object.assign({}, action);
    }
    return actionRequest;
  }

  function _makeController(params) {
    return { ...params, jsId: `controller_${++id}`, isMounted: false };
  }

  function _preprocessAction(action, context = {}) {
    action.context = makeContext([context, action.context], user.context);
    if (action.help && isHtmlEmpty(action.help)) delete action.help;
    action = { ...action };
    action.jsId = `action_${++id}`;
    if (action.type === 'ir.actions.act_window' || action.type === 'ir.actions.client') {
      action.target = action.target || 'current';
    }
    if (action.type === 'ir.actions.act_window') {
        action.views = [...action.views.map((v) => [v[0], v[1]])];
        action.controllers = {};
    }
    return action;
  }

  function _getBreadcrumbs(stack) {
    return stack.filter((controller) => controller.action.tag !== 'menu').map((controller) => {
        return {
          jsId: controller.jsId,
          get name() { return controller.displayName; },
          get isFormView() { return controller.props?.type === 'form'; },
          get url() { return stateToUrl(controller.state); },
          onSelected() { restore(controller.jsId); },
        };
      });
  }

  async function _updateUI(controller, options = {}) {
    let resolve;
    let reject;
    const currentActionProm = new Promise((_res, _rej) => { resolve = _res; reject = _rej; });
    const action = controller.action;
    if (action.target !== 'new' && 'newStack' in options) controllerStack = options.newStack;

    const index = _computeStackIndex(options);
    const nextStack = [...controllerStack.slice(0, index), controller];
    
    if (controller.action.target != 'new') {
      globalTabState.count++;
      controller.count = globalTabState.count;
      globalTabState.controllerStacks[nextStack[0].displayName] = nextStack;
    }

    controller.config.breadcrumbs = reactive(action.target === 'new' ? [] : _getBreadcrumbs(nextStack));
    controller.config.getDisplayName = () => controller.displayName;
    controller.config.setDisplayName = (displayName) => {
      controller.displayName = displayName;
      if (controller === _getCurrentController()) env.services.title.setParts({ action: controller.displayName });
    };

    class ControllerComponent extends Component {
      static template = xml`<t t-component="Component" t-props="componentProps"/>`;
      static Component = controller.Component;
      static props = ["*"];
      setup() {
        this.Component = controller.Component;
        this.componentProps = controller.props;
        onMounted(() => { controller.isMounted = true; resolve(); });
        onWillUnmount(() => { controller.isMounted = false; });
      }
    }

    if (action.target === 'new') {
        // ... dialog logic ...
    } else {
        controllerStack = nextStack;
    }

    controller.__info__ = {
      id: ++id,
      Component: ControllerComponent,
      componentProps: controller.props,
      controllerStacks: globalTabState.controllerStacks,
      count: globalTabState.count
    };

    // Update global state for tabs
    const action_infos = [];
    Object.entries(globalTabState.controllerStacks).forEach(([key, stack]) => {
        const last = stack[stack.length - 1];
        action_infos.push({
            key,
            __info__: last,
            Component: last.__info__?.Component || ControllerComponent,
            active: last.count === globalTabState.count,
            componentProps: last.props,
        });
    });
    globalTabState.action_infos = action_infos;

    env.services.dialog.closeAll();
    env.bus.trigger('ACTION_MANAGER:UPDATE', controller.__info__);
    return currentActionProm;
  }

  function _computeStackIndex(options) {
    if (options.clearBreadcrumbs) return 0;
    return controllerStack.length;
  }

  async function doAction(actionRequest, options = {}) {
    const action = await _loadAction(actionRequest, options.additionalContext);
    const preprocessedAction = _preprocessAction(action, options.additionalContext);
    const controller = _makeController({
        action: preprocessedAction,
        props: options.props || {},
        Component: actionRegistry.get(preprocessedAction.tag),
        displayName: preprocessedAction.name,
        config: {},
    });
    return _updateUI(controller, options);
  }

  function restore(jsId) {
    const index = controllerStack.findIndex((c) => c.jsId === jsId);
    if (index !== -1) return _updateUI(controllerStack[index], { index });
  }

  return {
    doAction,
    doActionButton: (params) => doAction(params.action, params),
    switchView: (viewType, props) => { /* logic */ },
    restore,
    loadState: () => { /* logic */ },
    get_info: () => _getCurrentController()?.__info__,
  };
}

export const actionService = {
  dependencies: ['dialog', 'notification', 'router', 'title', 'user'],
  start(env) {
    return makeActionManager(env);
  },
};
registry.category('services').remove('action');
registry.category('services').add('action', actionService);
