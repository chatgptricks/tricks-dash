import assert from 'node:assert/strict';
import { groupTopics, rankTopicPosts, performanceValue } from '../src/topicGroups.js';
const caption = 'An eight year old child from Canada built a wildlife alert application using Lovable to help neighbors report bear sightings safely.';
const posts = [
  { postKey: 'a:1', caption, timestamp: 1000, likes: 28, comments: 3 },
  { postKey: 'b:2', caption: caption + ' Follow @other for updates!', timestamp: 2000, likes: 500, comments: 1 },
  { postKey: 'c:3', caption: 'A research team develops a compact battery with solid electrodes for electric vehicles and renewable energy storage.', timestamp: 2000, likes: 800 },
  { postKey: 'd:4', caption: 'Follow us for more AI news', timestamp: 2000, likes: 1 },
  { postKey: 'e:5', caption: 'Follow us for more AI news', timestamp: 2000, likes: 2 },
];
const groups = groupTopics(posts);
assert.equal(groups.length, 4, 'similar stories group; generic boilerplate and unrelated stories stay separate');
assert.equal(groups[0].posts.length, 2);
assert.equal(rankTopicPosts(groups[0].posts, 'likes')[0].postKey, 'b:2');
assert.equal(rankTopicPosts(groups[0].posts, 'comments')[0].postKey, 'a:1');
assert.equal(groupTopics(posts, { separate: ['b:2'] }).length, 5);
assert.equal(performanceValue({ likes: null, comments: 2, views: 100 }, 'engagement'), -1);
assert.equal(performanceValue({ likes: 100, comments: 10, views: 0 }, 'engagement'), -1);
assert.equal(performanceValue({ likes: 100, comments: 10, views: 1000 }, 'engagement'), .11);
assert.equal(rankTopicPosts([{ likes: null }, { likes: 0 }], 'likes')[0].likes, 0);
assert.equal(performanceValue({ likes: 10, comments: 20 }, 'interactions'), 30);
assert.equal(groupTopics([]).length, 0);
assert.equal(posts[0].likes, 28, 'ranking does not mutate originals');
console.log('PASS topic matching, independent stories, champion metrics, missing data and separation');
const { productSections, sectionHref } = await import('../public/product-navigation.js');
globalThis.window = { location: { pathname: '/tracker.html', search: '?acc=chatgptricks' } };
globalThis.sessionStorage = { getItem: () => null };
const research = productSections.find((item) => item.id === 'research');
const decode = (href) => JSON.parse(Buffer.from(new URL(href, 'https://sentientdash.app').searchParams.get('r'), 'base64url').toString());
assert.equal(decode(sectionHref(research)).acc, 'chatgptricks', 'account follows Tracker to Research');
window.location = { pathname: '/index.html', search: '?acc=chatgptricks,rival&from=2026-09-01&to=2026-09-05' };
const insight = decode(sectionHref(productSections.find((item) => item.id === 'insights')));
assert.equal(insight.acc, 'chatgptricks,rival'); assert.equal(insight.from, '2026-09-01');
assert.equal(sectionHref(productSections.find((item) => item.id === 'tracker')), '/tracker.html', 'multi-account selection must not become an invalid Tracker handle');
console.log('PASS shared account/date context and multi-account routing');
