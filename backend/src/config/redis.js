const Queue = require('bull');
const env = require('./env');

const createQueue = (name, opts = {}) => {
  return new Queue(name, env.redis.url, {
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 200,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      ...opts,
    },
  });
};

const emailQueue = createQueue('email-send');
const replyCheckQueue = createQueue('reply-check');
const sheetsQueue = createQueue('sheets-poll');
const healthCheckQueue = createQueue('smtp-health-check');
const aiAgentQueue = createQueue('ai-agent');

module.exports = {
  createQueue,
  emailQueue,
  replyCheckQueue,
  sheetsQueue,
  healthCheckQueue,
  aiAgentQueue,
};
