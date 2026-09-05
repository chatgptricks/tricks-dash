import { groupTopics } from './topicGroups';
self.onmessage = ({ data }) => {
  const groups = groupTopics(data.posts, { separate: data.separate });
  self.postMessage(groups.map((group) => ({ id: group.id, keys: group.posts.map((post) => post.postKey) })));
};
