# The music drive and the folder picker

Two halves, one in each repository.

## The drive (app repository)

The Home Assistant app [trooperthorn/ha_app_music_assistant](https://github.com/trooperthorn/ha_app_music_assistant)
has a **Music drive** option: a partition of the Home Assistant server,
picked from a drop-down, that the app mounts at `/music/<label>` inside its
own container, natively through the host kernel (exFAT, FAT, NTFS, ext4,
btrfs, xfs). Nothing else on the host sees it and nothing is re-exported. An
exFAT volume that was not cleanly ejected is mounted read-only; the app's
one-off tasks (backup, verify, restore, repair) are described in that
repository's DOCS.md and design.md.

## The picker (this fork)

The Filesystem (local disk) provider asks for its path in its setup flow as
a text entry. This fork adds a **Browse** button beside it, in the add and
the reconfigure flows. Browse opens a dialog with the roots the server
allows as chips: the music drive (`/music`), the media folder and the share
folder. A root that is not present on the server is greyed and marked "not
mounted". Tap into folders, then **Use this folder** writes the path into
the entry; typing stays possible.

Point the provider at a folder *on* the drive rather than at the mount
point itself. When the drive is not mounted that folder does not exist, so
the provider reports itself unavailable and the library is untouched;
pointed at the mount point, an unmounted drive looks like an empty library
and every track is marked missing until the next scan.

The dialog reads `config/providers/browse_path`, an app-side edit of the
server that lists directories under those three roots only (every path is
checked against them with the server's own safe-path helper) and carries
the same scope that saves a provider config. A server without the edit
answers "unknown command"; the button then hides itself.

Code: `src/views/settings/fields/FolderPickerField.vue`,
`src/components/FolderPickerDialog.vue`, `src/helpers/folder_picker.ts`;
the field is chosen in `ConfigEntryField.vue` by provider domain and entry
key, the same switch the Home Assistant control pickers use, and the setup
flow dialog now passes the provider domain down to its rows.
