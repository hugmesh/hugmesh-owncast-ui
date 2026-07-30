// Native-federation config for the "owncast" remote.
//
// The shareAll args + RxJS skip list live in ./federation-base.js (copied
// BYTE-IDENTICAL from the hugmesh.systems host, like every other HugMesh
// remote) so this remote's federation surface can't drift from the host. The
// remote name ("owncast") and the exposed module key ("./Owncast") are the
// contract the host's loadRemoteModule() depends on AND the contract the
// federation-api owncast module row already points at:
//   remote_entry_url = http://hugmesh-owncast-ui:8080/remoteEntry.json
//   metadata.mountAt = /owncast   metadata.requiresRole = owncast   visibility = internal
// So the remoteEntry.json emitted by the production build MUST expose ./Owncast,
// and the container MUST serve it on :8080 (see Dockerfile + nginx.conf).
const { hugmeshRemote } = require('./federation-base');

module.exports = hugmeshRemote({
  name: 'owncast',
  exposes: {
    './Owncast': './src/app/owncast.routes.ts',
  },
});
