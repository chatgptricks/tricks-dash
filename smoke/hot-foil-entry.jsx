import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CoverImage } from '../src/postDetail';
import { PostCard } from '../src/PostCard';
import { obsidianCardHandlers } from '../src/obsidian-card';
import { returnCardFromSide } from '../src/card-flight';
import '../src/styles.css';
import '../public/obsidian.css';
import '../public/product-motion.css';

const cover = name => `https://foil-covers.test/${name}.svg`;
const sample = (name, extra = {}) => ({ shortcode:name, type:'Image', postType:'Image', showsHotBadge:true, hotMultiplier:3, coverUrl:cover(name), ...extra });
const flightPost = sample('vertical', { account:'foilfixture', postKey:'foilfixture:flight', shortcode:'flight', caption:'Local physical-card fixture', likes:1200, comments:20, postDate:'2026-10-03T12:00:00Z', permalink:'https://example.test/flight' });

function Probe({ name, post = sample(name) }) {
  return <article data-probe={name} className={`post-card obs-card${post.showsHotBadge ? ' obs-card-hot' : ''}`} {...obsidianCardHandlers}>
    <CoverImage className={`post-media${name === 'wide' ? ' selected-post-media' : ''}`} post={post} priority />
  </article>;
}

function Fixture() {
  const [selected, setSelected] = useState(false);
  const [source, setSource] = useState(flightPost);
  window.__foilFixture = {
    close:() => returnCardFromSide(flightPost.postKey, () => setSelected(false)),
    replaceCover:name => setSource(current => ({ ...current, coverUrl:cover(name) })),
  };
  return <>
    <style>{`
      body {margin:0;padding:20px;overflow:auto;background:#10131e} body::before{display:none}
      #pixel-probes {display:grid;grid-template-columns:repeat(3,240px);gap:20px;width:760px}
      /* Freeze projection only: screenshot differences measure image lighting,
         rather than perspective resampling. Production pointer handlers run. */
      #pixel-probes .obs-card {width:240px;height:320px;border-radius:0;transform:none!important;transition:none;box-shadow:none}
      #pixel-probes .post-media {width:240px;height:320px;aspect-ratio:3/4}
      #pixel-probes img {transition:none}
      #flight-source {position:absolute;top:20px;left:810px;width:240px}
      #flight-source .post-card {width:240px}
      #flight-inspector {position:fixed;inset:auto;top:20px;right:20px;width:240px;height:680px;transform:none;opacity:1;overflow:visible;pointer-events:auto}
      #flight-inspector .obs-card-slot {position:relative;width:240px;height:490px}
    `}</style>
    <main id="pixel-probes">
      <Probe name="vertical" /><Probe name="horizontal" /><Probe name="flat" />
      <Probe name="wide" /><Probe name="cold" post={sample('vertical', { showsHotBadge:false })} />
      <Probe name="missing" post={sample('missing', { coverUrl:'' })} /><Probe name="broken" />
    </main>
    <section id="flight-source"><PostCard post={source} selected={selected} onSelect={() => setSelected(true)} readOnly /></section>
    {selected ? <aside id="flight-inspector" className="obs-inspector is-open" aria-hidden="false"><div className="obs-card-slot" data-obs-sideview={flightPost.postKey} /></aside> : null}
  </>;
}

const root = createRoot(document.getElementById('root'));
window.__unmountFoilFixture = () => root.unmount();
root.render(<Fixture />);
