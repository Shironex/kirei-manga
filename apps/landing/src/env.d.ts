interface ImportMetaEnv {
  /** `/3d/mascot.glb` when the file is in public/3d at build time, else empty. */
  readonly MASCOT_GLB: string;
  /** The prop files in public/3d/props at build time, by name, comma separated. */
  readonly PROP_FILES: string;
}
