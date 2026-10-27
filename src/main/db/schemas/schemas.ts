import { orderSchemas } from './order-schemas'
import { dishSchemas } from './dish-schemas'
import { settingsSchemas } from './settings-shemas'
import { countrySchemas } from './country-schemas'
import { permissionSchemas } from './permission-schemas'
import { shiftSchemas } from './shift-schemas'
import { reportSchemas } from './report-schemas'
import { localAssetSchemas } from './local-assets-schemas'
import { deviceIdentitySchemas } from './device-identity-schemas'
import { logSchemas } from './log-schemas'

import { localSettingSchemas } from './local-setting-schemas'

import { scheduledOrderTaskSchemas } from './scheduled-order-task-schemas'

const CREATE_SETTINGS_TABLE = `
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT,
    value TEXT,
    UNIQUE (key)
);
`

export const schemas: Array<string> = [
  CREATE_SETTINGS_TABLE,
  ...permissionSchemas,
  ...orderSchemas,
  ...dishSchemas,
  ...settingsSchemas,
  ...countrySchemas,
  ...shiftSchemas,
  ...reportSchemas,
  ...localAssetSchemas,
  ...deviceIdentitySchemas,
  ...logSchemas,
  ...localSettingSchemas,
  ...scheduledOrderTaskSchemas,
]
