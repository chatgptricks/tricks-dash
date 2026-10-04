import visualCss from '../public/obsidian.css?inline';
import motionCss from '../public/product-motion.css?inline';
import researchCss from '../public/research-visual.css?inline';
import layoutCss from '../public/product-layout.css?inline';
import '../public/visual-effects.js';

const install = () => {
  let style = document.getElementById('visual-overrides');
  if (!style) {
    style = document.createElement('style');
    style.id = 'visual-overrides';
    document.head.append(style);
  }
  style.textContent = `${visualCss}\n${motionCss}\n${layoutCss}\n${document.documentElement.dataset.tool === 'research' ? researchCss : ''}`;
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
