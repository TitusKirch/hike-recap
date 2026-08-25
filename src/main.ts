import { createApp } from 'vue';
import './fonts.css';
import { holdFrame, installRenderBridge } from './render-bridge';
import Scene from './scene/Scene.vue';

createApp(Scene).mount('#scene');
installRenderBridge();

// Text reflows if a weight lands late, so block capture until fonts are ready.
const releaseFonts = holdFrame('fonts');
void document.fonts.ready.then(() => {
  releaseFonts();
});
