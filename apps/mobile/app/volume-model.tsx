import AuroraVolumeModel from "../components/aurora/volume-model";

/**
 * THE VOLUME MODEL — the settings route.
 *
 * The landmark fields, the profile form and the model switches used to be ~50
 * controls revealed inside the Volume SCREEN by an edit toggle, where a
 * mistyped number silently rewrote every band and verdict above it. Editing is
 * a place you go now, and what you did there is visible when you get there.
 */
export default function VolumeModel() {
  return <AuroraVolumeModel />;
}
