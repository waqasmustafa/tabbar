import { patch } from "@web/core/utils/patch";
import { registry } from "@web/core/registry";
import { reactive } from "@odoo/owl";

// Global reactive state for tabs
export const globalTabState = reactive({
    action_infos: [],
    controllerStacks: {},
    count: 0,
});

const actionService = registry.category("services").get("action");
const originalStart = actionService.start;

actionService.start = function (env) {
    const manager = originalStart(...arguments);

    // Listen to Odoo's internal update signal
    env.bus.addEventListener("ACTION_MANAGER:UPDATE", ({ detail: info }) => {
        if (!info || info.target === 'new') return;

        globalTabState.count = info.count || (globalTabState.count + 1);
        
        // Use the controller info provided by Odoo
        const controller = info;
        const stackName = controller.displayName || "Action";

        // Create a unique key for the tab
        if (!globalTabState.controllerStacks[stackName]) {
            globalTabState.controllerStacks[stackName] = [];
        }
        
        // Keep track of the current controller in our stack
        globalTabState.controllerStacks[stackName] = [controller];

        // Update the list of tabs for the UI
        const action_infos = [];
        Object.entries(globalTabState.controllerStacks).forEach(([key, stack]) => {
            const last = stack[stack.length - 1];
            if (last) {
                action_infos.push({
                    key,
                    __info__: last,
                    Component: last.Component || (last.__info__ ? last.__info__.Component : null),
                    active: last.count === globalTabState.count || last.id === info.id,
                    componentProps: last.componentProps || last.props || {},
                });
            }
        });
        
        // Update the global state (this triggers the UI re-render)
        globalTabState.action_infos = action_infos;
    });

    return manager;
};
