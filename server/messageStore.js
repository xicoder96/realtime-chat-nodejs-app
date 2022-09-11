/* abstract */ class MessageStore {
    saveMessage(message) { }
    findMessagesForUser(userID) { }
}

class InMemoryMessageStore extends MessageStore {
    constructor() {
        super();
        this.messages = [];
    }

    saveMessage(message) {
        this.messages.push(message);
    }

    findMessagesForUser(userID) {
        return this.messages.filter(
            ({ from, to }) => from === userID || to === userID
        );
    }
}

const CONVERSATION_TTL = 24 * 60 * 60;

class RedisMessageStore extends MessageStore {
    constructor(redisClient) {
        super();
        this.redisClient = redisClient;
    }

    saveMessage(message) {
        const value = JSON.stringify(message);
        this.redisClient
            .multi()
            .rPush(`messages:${message.from}`, value)
            .rPush(`messages:${message.to}`, value)
            .expire(`messages:${message.from}`, CONVERSATION_TTL)
            .expire(`messages:${message.to}`, CONVERSATION_TTL)
            .exec();
    }

    async clearMemory() {
        const keys = await this.redisClient.keys("messages:*")
        if (keys.length)
            await this.redisClient.del(keys)
    }

    findMessagesForUser(userID) {
        return this.redisClient
            .lRange(`messages:${userID}`, 0, -1)
            .then((results) => {
                return results.map((result) => JSON.parse(result));
            });
    }
}

module.exports = {
    InMemoryMessageStore,
    RedisMessageStore,
};
