-- 0003: app-wide settings.
--
-- One row per setting the user changed; a missing row means the default.
-- `key` is a dotted setting key (`appearance.strength`) and `value` its JSON
-- text. The typed contract and the defaults live in `kirei_core::AppSettings`,
-- so adding a setting needs no migration. Rows for keys this build does not
-- know (written by a newer one) are kept and ignored.

CREATE TABLE app_settings (
    key        TEXT    PRIMARY KEY,
    value      TEXT    NOT NULL,
    updated_at INTEGER NOT NULL
) WITHOUT ROWID;
