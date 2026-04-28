import { ActionContainer } from '@web/webclient/actions/action_container';
import { patch } from '@web/core/utils/patch';
import { AklMultiTab } from './components/multi_tab/akl_multi_tab';

import { xml, useState } from '@odoo/owl';
import { browser } from '@web/core/browser/browser';
import { useService } from '@web/core/utils/hooks';
import {
    router as _router,
} from '@web/core/browser/router';
patch(ActionContainer.prototype, {
    setup() {
        super.setup();
        this.state = useState({
            isMultiTabEnabled: false,
            action_infos: [],
        });
        this.controllerStacks = {};

        // Initial check for existing actions (Fixes the refresh issue)
        const aklData = window.__akl_multi_tab__;
        if (aklData) {
            this.state.action_infos = this.get_controllers(aklData);
            this.controllerStacks = aklData.controllerStacks;
            this.state.isMultiTabEnabled = aklData.isEnabled;
        }

        this.env.bus.addEventListener(
            'ACTION_MANAGER:UPDATE',
            ({ detail: info }) => {
                const aklData = window.__akl_multi_tab__;
                if (aklData) {
                    this.state.isMultiTabEnabled = !!aklData.isEnabled;
                }
                
                if (!this.state.isMultiTabEnabled) {
                    // Standard Odoo behavior: only show the latest action
                    const controllers = this.get_controllers(info);
                    this.state.action_infos = controllers.length > 0 ? [controllers.at(-1)] : [];
                    this.render();
                    return;
                }
                this.state.action_infos = this.get_controllers(info);
                this.controllerStacks = (info && info.controllerStacks) || (aklData ? aklData.controllerStacks : {});
                this.render();
            }
        );
    },
    get_controllers(info) {
        const aklData = window.__akl_multi_tab__;
        const currentControllerStacks = (info && info.controllerStacks) || (aklData && aklData.controllerStacks) || {};
        const currentCount = (info && info.count) || (aklData && aklData.count) || 0;

        const action_infos = [];
        const entries = Object.entries(currentControllerStacks);

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
            }

            if (lastController.count == currentCount) {
                action_info.active = true;
            }
            action_infos.push(action_info);
        })

        // Sort by count to maintain tab order if possible, or just return
        return action_infos;
    },

    _on_close_action(action_info) {
        this.state.action_infos = this.state.action_infos.filter((info) => {
            return info.key !== action_info.key;
        });
        if (this.state.action_infos.length > 0) {

            delete this.controllerStacks[action_info.key];
            this.state.action_infos[this.state.action_infos.length - 1].active = true; // Set last 
            this.render();

        }

    },
    _on_active_action(action_info) {
        this.state.action_infos.forEach((info) => {
            info.active = info.key === action_info.key;
        });
        const url = _router.stateToUrl(action_info.__info__.state)
        browser.history.pushState({}, "", url);
        this.render();
    },
    _close_other_action() {
        this.state.action_infos = this.state.action_infos.filter((info) => {
            if (info.active == false) {
                delete this.controllerStacks[info.key];
            }
            return info.active == true
        });

        this.render();
    },
    _close_current_action() {
        this.state.action_infos = this.state.action_infos.filter((info) => {
            if (info.active == true) {
                delete this.controllerStacks[info.key];
            }
            return info.active == false
        });
        this.state.action_infos[this.state.action_infos.length - 1].active = true;
        this.render();
    },
    _on_close_all_action() {
        this.state.action_infos.forEach((info) => {
            delete this.controllerStacks[info.key];
        });
        this.state.action_infos = []
        window.location.href = "/";

    }
});
ActionContainer.components = {
    ...ActionContainer.components,
    AklMultiTab,
};
ActionContainer.template = xml`
 <t t-name="web.ActionContainer">
        <t t-set="action_infos" t-value="state.action_infos" />
        <div class="o_action_manager d-flex flex-column">
            <t t-if="state.isMultiTabEnabled">
                <AklMultiTab 
                        action_infos="action_infos"
                        active_action="(action_info) => this._on_active_action(action_info)"
                        close_action="(action_info) => this._on_close_action(action_info)"
                        close_current_action="() => this._close_current_action()"
                        close_other_action="() => this._close_other_action()"
                        close_all_action="() => this._on_close_all_action()"
                    />
                <div t-foreach="action_infos" t-as="action_info" t-if="action_info" t-key="action_info.key" class="akl_controller_container d-flex flex-column" t-att-class="action_info.active ? '' : 'd-none'" >
                    <t t-component="action_info.Component" className="'o_action'" t-props="action_info.componentProps" />
                </div>
            </t>
            <t t-else="">
                <t t-if="action_infos.length > 0">
                    <t t-component="action_infos[action_infos.length - 1].Component" className="'o_action'" t-props="action_infos[action_infos.length - 1].componentProps" />
                </t>
            </t>
        </div>
    </t>
`;
