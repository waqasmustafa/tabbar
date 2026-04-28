from odoo import models
from odoo.http import request

class IrHttp(models.AbstractModel):
    _inherit = 'ir.http'

    def session_info(self):
        result = super(IrHttp, self).session_info()
        is_multi_tab = self.env['ir.config_parameter'].sudo().get_param('tabbar.is_multi_tab')
        result['is_multi_tab'] = is_multi_tab == 'True' or is_multi_tab is True
        return result
