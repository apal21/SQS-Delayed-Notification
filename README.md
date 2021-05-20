# SQS Delayed Notification
The objective of this project is to send delayed webhook (callback) notifications with exponential backoff.

This project acts as a wrapper for SQS (`aws-sdk`). So you can use all the features supported by `aws-sdk`.

---

## How it works
To send the webhooks notifications with exponential backoff, this package uses the `Dead-letter Queue` approach.

In SQS, if the message is not deleted (acknowledged) from the queue after being consumed for a specific number of times (`message receive count`) before the `Message retention period` of the queue, that message is automatically sent to the specified dead-letter queue.

---

## How to use

### Install the package
```shell
npm install sqs-delayed-notification
```

### Importing the module
ES5 - using require,

```javascript
const Webhook = require('sqs-delayed-notification').default;

// initialize
const webhook = new Webhook('webhook-demo', { region: 'ap-south-1' });
```

ES6+ - using import,

```javascript
import * as Webhook from 'sqs-delayed-notification';

// initialize
const webhook = new Webhook('webhook-demo', { region: 'ap-south-1' });
```

### Create a project
To create the project, you need to pass an array of [queueConfig parameters](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html#createQueue-property) inside the `.create()` method.

It creates the queues and configures the dead-letter queues.

```javascript
const response = await webhook.create({
    queueConfig: [
        { Attributes: { FifoQueue: 'true', RedrivePolicy: '{ "maxReceiveCount": "2" }', ContentBasedDeduplication: 'true' }, },
        { Attributes: { FifoQueue: 'true', RedrivePolicy: '{ "maxReceiveCount": "2" }', ContentBasedDeduplication: 'true' }, },
        { Attributes: { FifoQueue: 'true', ContentBasedDeduplication: 'true' } },
    ],
});
```

> `.create()` overrides the `QueueName` and `RedrivePolicy.deadLetterTargetArn`.

- Here, `.create()` method returns a promise of an `Array of [AWSError, SQS.CreateQueueResult]` for each queue.
- In this example, the name of our project is `webhook-demo`, that means it creates 3 queues:
  1. `webhook-demo-level-0.fifo`
  2. `webhook-demo-level-1.fifo`
  3. `webhook-demo-level-2.fifo`
- The queue `webhook-demo-level-1.fifo` will be the dead-letter queue for `webhook-demo-level-0.fifo`, `level-2` for `level-1` and so on.
- You can set the different `VisibilityTimeout` attribute for each queue to receive the messages after a certain interval.

> **Note:** Do not pass `RedrivePolicy` for the last queue because the last queue don't have the dead-letter queue.

### List Queues
To list all the queues whose name starts with your project name. You can pass the [listQueues parameters](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html#listQueues-property) in the `queueConfig` object.

```javascript
const [err, data] = await webhook.list({ queueConfig: {} });
```

> `.list()` overrides `QueueNamePrefix` from the queue config

- Returns a promise of an array of `AWSError, SQS.ListQueuesResult`.

### Send a Message
The `.send()` method sends the message to the `level-0` queue. You can pass the [sendMessage parameters](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html#sendMessage-property) to the send method.

```javascript
const [err, data] = await webhook.send(
    { MessageBody: 'Hello World!', MessageGroupId: 'G1' },
);
```

- Returns a promise of an array of `AWSError, SQS.SendMessageResult`

> **Note:** You can't send the message to any other level of queues to achieve the exponential backoff. It is the same for sending the message in batches.

### Send Messages in a Batch
The `.sendBatch()` method can deliver up to 10 messages (SQS limitation) to the `level-0` queue. You can pass the [sendMessageBatch parameters](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html#sendMessageBatch-property) to the sendBatch method.

```javascript
const [err, data] = await webhook.sendBatch({
    Entries: [
        { MessageBody: 'First Message', MessageGroupId: 'G2', Id: '1' },
        { MessageBody: 'Second Message', MessageGroupId: 'G2', Id: '2' },
    ],
});
```

- Returns a promise of an array of `AWSError, SQS.SendMessageBatchResult`

### Receive Messages
To receive a message from a specific queue, you need to pass the level number (0, 1, 2,...) and the [receiveMessage parameters](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SQS.html#receiveMessage-property) inside `queueConfig` in the `.receive()` method.

Since the `receiveMessage` method of SQS doesn't listen to the new messages, you have to set `setInterval` or something similar to fetch the messages.

```javascript
const [err, data, acknowledge] = await webhook.receive({ level: 0, queueConfig: {} });

if (err) {
    throw err;
}

if (data.Messages) {
    acknowledge(data.Messages[0].ReceiptHandle, (err, result) => {
        if (err) {
            throw err;
        }
        console.log(result);
    });
}
```

- Returns a promise of an array of `AWSError, SQS.ReceiveMessageResult` and `acknowledge` uses the `deleteMessage` of SQS if the ReceiptHandle is a string and `deleteMessageBatch` if an array of ReceiptHandle is passed.

If you want to acknowledge/delete messages in batches, you can pass an array of `ReceiptHandle` to the acknowledge function.

```javascript
acknowledge([ReceiptHandle1, ReceiptHandle2], (err, result) => {
    if (err) {
        throw err;
    }
    console.log(result);
});
```

> **Note:** To achieve exponential backoff, acknowledge the message only if your message is delivered successfully.

### Delete a Project
The `.delete()` method is used to delete all the queues whose name start with the `projectName` specified while initializing the project.

```javascript
const response = await webhook.delete();
```

- Returns a promise of an array of `[AWSError, unknown]` for each queue.
