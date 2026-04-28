import { ActionContainer } from '@web/webclient/actions/action_container';
import { patch } from '@web/core/utils/patch';
import { AklMultiTab } from './components/multi_tab/akl_multi_tab';
import { makeActionManager } from './action_service';

import { useState, onMounted } from '@odoo/owl';
import { browser } from '@web/core/browser/browser';
import { useService } from '@web/core/utils/hooks';
import {
    router as _router,
} from '@web/core/browser/router';

patch(ActionContainer.prototype, {
    setup() {
        super.setup();

        // Use reactive state so OWL re-renders on any change
        this.state = useState({
            action_infos: [],
            controllerStacks: {},
        });

        // Use the action service to potentially get info on setup
        this.action_service = useService('action');

        // If the ACTION_MANAGER:UPDATE event already fired before this
        // component mounted (e.g. clicking an app from the dashboard),
        // recover from the cached global reference.
        onMounted(() => {
            const lastInfo = makeActionManager._lastInfo;
            if (lastInfo && this.state.action_infos.length === 0) {
                const infos = this._get_controllers(lastInfo);
                if (infos.length > 0) {
                    this.state.action_infos = infos;
                    this.state.controllerStacks = lastInfo.controllerStacks || {};
                }
            }
        });

        this.env.bus.addEventListener(
            'ACTION_MANAGER:UPDATE',
            ({ detail: info }) => {
                this.state.action_infos = this._get_controllers(info);
                this.state.controllerStacks = info.controllerStacks || {};
            }
        );
    },

    _get_controllers(info) {
        if (!info) {
            return [];
        }
        const action_infos = [];
        const entries = Object.entries(info.controllerStacks || {});

        entries.forEach(([key, stack]) => {
            if (!stack || stack.length === 0) {
                return;
            }
            const lastController = stack[stack.length - 1];
            if (!lastController || !lastController.__info__) {
                return;
            }

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
        this.state.action_infos = this.state.action_infos.filter((info) => {
            return info.key !== action_info.key;
        });
        if (this.state.action_infos.length > 0) {
            delete this.state.controllerStacks[action_info.key];
            this.state.action_infos[this.state.action_infos.length - 1].active = true;
        }
    },

    _on_active_action(action_info) {
        this.state.action_infos.forEach((info) => {
            info.active = info.key === action_info.key;
        });
        const url = _router.stateToUrl(action_info.__info__.state);
        browser.history.pushState({}, '', url);
    },

    _close_other_action() {
        this.state.action_infos = this.state.action_infos.filter((info) => {
            if (!info.active) {
                delete this.state.controllerStacks[info.key];
            }
            return info.active;
        });
    },

    _close_current_action() {
        this.state.action_infos = this.state.action_infos.filter((info) => {
            if (info.active) {
                delete this.state.controllerStacks[info.key];
            }
            return !info.active;
        });
        if (this.state.action_infos.length > 0) {
            this.state.action_infos[this.state.action_infos.length - 1].active = true;
        }
    },

    _on_close_all_action() {
        this.state.action_infos.forEach((info) => {
            delete this.state.controllerStacks[info.key];
        });
        this.state.action_infos = [];
        window.location.href = '/';
    },
});

// Adding child components to the class
ActionContainer.components = {
    ...ActionContainer.components,
    AklMultiTab,
};
