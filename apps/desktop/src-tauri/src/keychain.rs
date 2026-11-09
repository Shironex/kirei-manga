//! Secrets in the OS credential store: Keychain on macOS, Credential Manager
//! on Windows. Never in settings, the library database, backups or IPC
//! payloads.
//!
//! Every entry lives under one service name with a dotted account per
//! secret (`anilist.token`).

/// The service every entry is filed under: the app identifier.
pub(crate) const SERVICE: &str = "app.kireimanga.desktop";

/// Where a secret is kept. The keychain in the app, memory in tests.
pub(crate) trait SecretStore: Send + Sync {
    fn get(&self, account: &str) -> Result<Option<String>, String>;
    fn set(&self, account: &str, value: &str) -> Result<(), String>;
    /// Removing an entry that is not there is not an error.
    fn delete(&self, account: &str) -> Result<(), String>;
}

/// The OS credential store.
pub(crate) struct Keychain;

impl Keychain {
    fn entry(account: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(SERVICE, account).map_err(|error| describe(&error))
    }
}

impl SecretStore for Keychain {
    fn get(&self, account: &str) -> Result<Option<String>, String> {
        match Self::entry(account)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(describe(&error)),
        }
    }

    fn set(&self, account: &str, value: &str) -> Result<(), String> {
        Self::entry(account)?
            .set_password(value)
            .map_err(|error| describe(&error))
    }

    fn delete(&self, account: &str) -> Result<(), String> {
        match Self::entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(describe(&error)),
        }
    }
}

/// The error without the stored value; keyring errors never carry it, but
/// the message is kept generic on purpose.
fn describe(error: &keyring::Error) -> String {
    format!("the system keychain refused the request: {error}")
}

/// A store that forgets on drop, for tests.
#[cfg(test)]
#[derive(Default)]
pub(crate) struct MemoryStore(std::sync::Mutex<std::collections::HashMap<String, String>>);

#[cfg(test)]
impl SecretStore for MemoryStore {
    fn get(&self, account: &str) -> Result<Option<String>, String> {
        Ok(self.0.lock().unwrap().get(account).cloned())
    }

    fn set(&self, account: &str, value: &str) -> Result<(), String> {
        self.0
            .lock()
            .unwrap()
            .insert(account.to_owned(), value.to_owned());
        Ok(())
    }

    fn delete(&self, account: &str) -> Result<(), String> {
        self.0.lock().unwrap().remove(account);
        Ok(())
    }
}
