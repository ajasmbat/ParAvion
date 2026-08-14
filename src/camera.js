// Stub — filled in by PARA-BMZ9NM (free-fly camera + pointer lock).
// Ticket PARA-Y6KLG7 keeps only the export signature stable so downstream
// tickets can develop against it in parallel.
export function createCameraController(camera, domElement) {
  void camera;
  void domElement;
  return {
    update(dt) {
      void dt;
    },
    dispose() {},
  };
}
