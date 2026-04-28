from odoo import fields, models

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    is_multi_tab = fields.Boolean(
        string="Enable Multi Tabs",
        config_parameter='tabbar.is_multi_tab',
        help="Check this to enable multi-tab navigation in the backend."
    )
