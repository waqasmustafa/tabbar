import { Component, useRef } from '@odoo/owl';
import { Dropdown } from '@web/core/dropdown/dropdown';
import { DropdownItem } from '@web/core/dropdown/dropdown_item';
import { DropdownGroup } from '@web/core/dropdown/dropdown_group';
export class AklMultiTab extends Component {
  static template = 'akl_multi_tab.tab';
  static components = { Dropdown, DropdownItem, DropdownGroup };
  static props = ['*'];
  setup() {
    super.setup();
    this.tabContainerRef = [];
  }
  rollPage() { }
  _close_all_action() { this.props.close_all_action(); }
  _close_current_action() {
    this.props.close_current_action();
  }
  _close_other_action() {
    this.props.close_other_action();
  }
  _on_click_tab_close(info) {
    this.props.close_action(info);
  }
  _on_click_tab_item(info) {
    this.props.active_action(info);
  }
  _on_multi_tab_next() { }
  _on_multi_tab_prev() { }
  get action_infos() { }
  get current_action_info() { }
}
