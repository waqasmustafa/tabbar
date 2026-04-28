import { patch } from "@web/core/utils/patch";
import { registry } from "@web/core/registry";
import { reactive } from "@odoo/owl";
import { router as _router } from "@web/core/browser/router";

// Global reactive state for tabs
export const globalTabState = reactive({
    action_infos: [],
    controllerStacks: {},
    count: 0,
});

// We patch the action service definition instead of replacing it
const actionService = registry.category("services").get("action");
const originalStart = actionService.start;

actionService.start = function (env) {
    const manager = originalStart(...arguments);

    // Patch the doAction method to track tabs
    const originalDoAction = manager.doAction;
    manager.doAction = async function (actionRequest, options = {}) {
        const result = await originalDoAction.apply(this, arguments);
        
        // After action is loaded, we update our global tab state
        const controller = manager.get_info ? manager.get_info() : null;
        if (controller && controller.action && controller.action.target !== 'new') {
            globalTabState.count++;
            controller.count = globalTabState.count;
            
            // Track the stack for this action
            const stackName = controller.displayName || "Unknown";
            // Note: Odoo 18 might handle stacks differently, but we keep our logic
            globalTabState.controllerStacks[stackName] = [controller]; 

            // Update action_infos for the UI
            const action_infos = [];
            Object.entries(globalTabState.controllerStacks).forEach(([key, stack]) => {
                const last = stack[stack.length - 1];
                action_infos.push({
                    key,
                    __info__: last,
                    Component: last.Component || last.__info__?.Component,
                    active: last.count === globalTabState.count,
                    componentProps: last.props || last.__info__?.componentProps || {},
                });
            });
            globalTabState.action_infos = action_infos;
        }
        return result;
    };

    // Add our helper method to the manager
    manager.get_info = () => {
        // This is a bit hacky but works for getting current state
        if (manager.currentController) return manager.currentController;
        return null;
    };

    return manager;
};
