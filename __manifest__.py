# -*- coding: utf-8 -*-
{
    'name': "Multi Tabs",

    'summary': "Multi Tabs for Odoo 18",

    'description': """
        Multi Tabs
    """,

    "author": "1311793927@qq.com",
    'support': '1311793927qq.com',
	'images': ['static/description/main_banner.png'],
    'category': 'General',
    'version': '0.1',
     "license": "LGPL-3",
    'depends': ['base','web'],
    'data': [
        'views/res_config_settings_views.xml',
    ],
    "installable": True,
    "auto_install": False,
    "assets": {
        "web.assets_backend": [
           "tabbar/static/src/**/*",
        ],
    },
            
}
