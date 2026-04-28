import { ActionContainer } from '@web/webclient/actions/action_container';
import { patch } from '@web/core/utils/patch';
import { AklMultiTab } from './components/multi_tab/akl_multi_tab';
import { makeActionManager } from './action_service';

import { xml, useState, onMounted } from '@odoo/owl';
import { browser } from '@web/core/browser/browser';
import { useService } from '@web/core/utils/hooks';
import {
    router as _router,
} from '@web/core/browser/router';

patch(ActionContainer.prototype, {
    setup() {
        super.setup();
        
        // Reactive state for OWL to track changes
        this.state = useState({
            action_infos: [],
            controllerStacks: {},
        });

        this.action_service = useService('action');

        // Recover state on mount (fixes the dashboard click issue)
        onMounted(() => {
            const lastInfo = makeActionManager._lastInfo;
            if (lastInfo) {
                this.state.action_infos = this._get_controllers(lastInfo);
                this.state.controllerStacks = lastInfo.controllerStacks || {};
            }
        });

        this.env.bus.addEventListener(
            'ACTION_MANAGER:UPDATE',
            ({ detail: info }) => {
                this.state.action_infos = this._get_controllers(info);
                this.state.controllerStacks = info.controllerStacks || {};
                this.render(); // Force a re-render just in case
            }
        );
    },

    _get_controllers(info) {
        if (!info) return [];
        const action_infos = [];
        const entries = Object.entries(info.controllerStacks || {});

        entries.forEach(([key, stack]) => {
            if (!stack || stack.length === 0) return;
            const lastController = stack[stack.length - 1];
            if (!lastController || !lastController.__info__) return;

            const action_info = {
                key: key,
                __info__: lastController,
                Component: lastController.__info__.Component,
                active: false,
                componentProps: lastController.__info__.componentProps || {},
            };

            if (lastController.count == info.count) {
                action_info.active = true;
            }
            action_infos.push(action_info);
        });
        return action_infos;
    },

    _on_close_action(action_info) {
        this.state.action_infos = this.state.action_infos.filter((info) => info.key !== action_info.key);
        if (this.state.action_infos.length > 0) {
            delete this.state.controllerStacks[action_info.key];
            this.state.action_infos[this.state.action_infos.length - 1].active = true;
        }
    },

    _on_active_action(action_info) {
        this.state.action_infos.forEach((info) => {
            info.active = (info.key === action_info.key);
        });
        const url = _router.stateToUrl(action_info.__info__.state);
        browser.history.pushState({}, '', url);
    },

    _close_other_action() {
        this.state.action_infos = this.state.action_infos.filter((info) => {
            if (!info.active) delete this.state.controllerStacks[info.key];
            return info.active;
        });
    },

    _close_current_action() {
        this.state.action_infos = this.state.action_infos.filter((info) => {
            if (info.active) delete this.state.controllerStacks[info.key];
            return !info.active;
        });
        if (this.state.action_infos.length > 0) {
            this.state.action_infos[this.state.action_infos.length - 1].active = true;
        }
    },

    _on_close_all_action() {
        this.state.action_infos.forEach((info) => delete this.state.controllerStacks[info.key]);
        this.state.action_infos = [];
        window.location.href = "/";
    }
});

ActionContainer.components = {
    ...ActionContainer.components,
    AklMultiTab,
};

// Direct template overwrite in JS
ActionContainer.template = xml`
<t t-name="web.ActionContainer">
    <div class="o_action_manager d-flex flex-column">
        <AklMultiTab
            action_infos="state.action_infos"
            active_action="(info) => this._on_active_action(info)"
            close_action="(info) => this._on_close_action(info)"
            close_current_action="() => this._close_current_action()"
            close_other_action="() => this._close_other_action()"
            close_all_action="() => this._on_close_all_action()"
        />
        <div t-foreach="state.action_infos" t-as="info" t-if="info" t-key="info.key" 
             class="akl_controller_container d-flex flex-column" 
             t-att-class="info.active ? '' : 'd-none'">
            <t t-component="info.Component" className="'o_action'" t-props="info.componentProps" />
        </div>
    </div>
</t>
`;
