import { ActionContainer } from '@web/webclient/actions/action_container';
import { patch } from '@web/core/utils/patch';
import { AklMultiTab } from './components/multi_tab/akl_multi_tab';
import { globalTabState } from './action_service';
import { browser } from '@web/core/browser/browser';
import { router as _router } from '@web/core/browser/router';
import { useState } from "@odoo/owl";

patch(ActionContainer.prototype, {
    setup() {
        super.setup();
        // Use useState to make the component subscribe to the global reactive state.
        // This ensures OWL re-renders the UI as soon as the global state changes.
        this.globalTabs = useState(globalTabState);
    },

    _on_close_action(action_info) {
        this.globalTabs.action_infos = this.globalTabs.action_infos.filter((info) => info.key !== action_info.key);
        if (this.globalTabs.action_infos.length > 0) {
            delete this.globalTabs.controllerStacks[action_info.key];
            this.globalTabs.action_infos[this.globalTabs.action_infos.length - 1].active = true;
        }
    },

    _on_active_action(action_info) {
        this.globalTabs.action_infos.forEach((info) => {
            info.active = (info.key === action_info.key);
        });
        const url = _router.stateToUrl(action_info.__info__.state);
        browser.history.pushState({}, '', url);
    },

    _close_other_action() {
        this.globalTabs.action_infos = this.globalTabs.action_infos.filter((info) => {
            if (!info.active) delete this.globalTabs.controllerStacks[info.key];
            return info.active;
        });
    },

    _close_current_action() {
        this.globalTabs.action_infos = this.globalTabs.action_infos.filter((info) => {
            if (info.active) delete this.globalTabs.controllerStacks[info.key];
            return !info.active;
        });
        if (this.globalTabs.action_infos.length > 0) {
            this.globalTabs.action_infos[this.globalTabs.action_infos.length - 1].active = true;
        }
    },

    _on_close_all_action() {
        Object.keys(this.globalTabs.controllerStacks).forEach(key => delete this.globalTabs.controllerStacks[key]);
        this.globalTabs.action_infos = [];
        window.location.href = "/";
    }
});

ActionContainer.components = {
    ...ActionContainer.components,
    AklMultiTab,
};
