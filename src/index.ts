import { AWSError, SQS } from 'aws-sdk';
import CreateQueuesInterface from './interfaces/create-queues.interface';
import ListQueuesInterface from './interfaces/list-queues.interface';
import ReceiveMessageInterface from './interfaces/receive-message.interface';

export default class SQSWrapper {
  private sqs: SQS;

  private awsConfig: SQS.ClientConfiguration;

  private awsAccountId: string;

  private readonly projectName: string;

  private queueUrls: string[] = [];

  constructor(projectName: string, awsConfig: SQS.ClientConfiguration) {
    this.awsConfig = awsConfig;
    this.awsAccountId = '';
    this.projectName = projectName;
    this.sqs = new SQS(awsConfig);
  }

  async create(
    params: CreateQueuesInterface,
  ): Promise<[AWSError, SQS.CreateQueueResult][]> {
    const { queueConfig } = params;
    const response: [AWSError, SQS.CreateQueueResult][] = [];
    // Update QueueName everywhere in queueConfig
    for (let i = queueConfig.length - 1; i >= 0; i -= 1) {
      queueConfig[i].QueueName = `${this.projectName}-level-${i}`;
      if (queueConfig[i]?.Attributes?.FifoQueue) {
        queueConfig[i].QueueName = `${queueConfig[i].QueueName}.fifo`;
      }

      // Add deadLetterTargetArn for everything except the last queue
      if (i !== queueConfig.length - 1) {
        queueConfig[i].Attributes = { ...queueConfig[i]?.Attributes };
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const { RedrivePolicy } = queueConfig[i].Attributes!;

        const redrivePolicy = JSON.parse(RedrivePolicy || '{}');

        queueConfig[i].Attributes!.RedrivePolicy = JSON.stringify({
          ...redrivePolicy,
          deadLetterTargetArn: `arn:aws:sqs:${this.awsConfig.region}:${
            this.awsAccountId
          }:${this.projectName}-level-${i + 1}${
            queueConfig[i]?.Attributes?.FifoQueue ? '.fifo' : ''
          }`,
        });
      }

      // eslint-disable-next-line no-await-in-loop
      const result: [AWSError, SQS.CreateQueueResult] = await new Promise(
        (resolve) => {
          this.sqs.createQueue(queueConfig[i], (err, data) => {
            if (!err) {
              // eslint-disable-next-line prefer-destructuring
              this.awsAccountId = data.QueueUrl!.split('/')[3];
            }
            resolve([err, data]);
          });
        },
      );

      response.push(result);
    }

    return response.reverse();
  }

  async list(
    params: ListQueuesInterface,
  ): Promise<[AWSError, SQS.ListQueuesResult]> {
    const { queueConfig } = params;
    queueConfig.QueueNamePrefix = `${this.projectName}`;

    return new Promise((resolve) => {
      this.sqs.listQueues(queueConfig, (err, data) => {
        if (data.QueueUrls) {
          this.queueUrls = data.QueueUrls;
        }
        resolve([err, data]);
      });
    });
  }

  async delete(): Promise<[AWSError, unknown][]> {
    const response: [AWSError, unknown][] = [];
    const [error, { QueueUrls }] = await this.list({
      queueConfig: { QueueNamePrefix: `${this.projectName}` },
    });

    if (error) {
      return [[error, null]];
    }

    for (let i = 0; i < (QueueUrls?.length || 0); i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const result: [AWSError, unknown] = await new Promise((resolve) => {
        if (QueueUrls) {
          this.sqs.deleteQueue({ QueueUrl: QueueUrls[i] }, (err, data) => {
            resolve([err, data]);
          });
        }
      });
      response.push(result);
    }
    return response;
  }

  async send(
    params: SQS.SendMessageRequest,
  ): Promise<[AWSError, SQS.SendMessageResult]> {
    if (this.queueUrls.length === 0) {
      await this.list({ queueConfig: {} });
    }
    // eslint-disable-next-line no-param-reassign,prefer-destructuring
    params.QueueUrl = this.queueUrls.sort()[0];
    return new Promise((resolve) => {
      this.sqs.sendMessage(params, (err, data) => {
        resolve([err, data]);
      });
    });
  }

  async sendBatch(
    params: SQS.SendMessageBatchRequest,
  ): Promise<[AWSError, SQS.SendMessageBatchResult]> {
    if (this.queueUrls.length === 0) {
      await this.list({ queueConfig: {} });
    }
    // eslint-disable-next-line no-param-reassign,prefer-destructuring
    params.QueueUrl = this.queueUrls.sort()[0];
    return new Promise((resolve) => {
      this.sqs.sendMessageBatch(params, (err, data) => {
        resolve([err, data]);
      });
    });
  }

  async receive(
    params: ReceiveMessageInterface,
  ): Promise<
    [
      AWSError,
      SQS.ReceiveMessageResult,
      (
        ReceiptHandle: string | [],
        callback: (error: AWSError, response: unknown) => void,
      ) => void,
    ]
  > {
    const { level, queueConfig } = params;

    if (this.queueUrls.length === 0) {
      await this.list({ queueConfig: {} });
    }

    // eslint-disable-next-line prefer-destructuring
    queueConfig.QueueUrl = this.queueUrls.filter((url) =>
      url.includes(`${this.projectName}-level-${level}`),
    )[0];

    return new Promise((resolve) => {
      this.sqs.receiveMessage(queueConfig, (err, data) => {
        const acknowledge = (
          ReceiptHandle: string | [],
          callback: (error: AWSError, response: unknown) => void,
        ) => {
          if (typeof ReceiptHandle === 'string') {
            this.sqs.deleteMessage(
              { QueueUrl: queueConfig.QueueUrl, ReceiptHandle },
              callback,
            );
          } else if (Array.isArray(ReceiptHandle)) {
            this.sqs.deleteMessageBatch({
              QueueUrl: queueConfig.QueueUrl,
              Entries: ReceiptHandle,
            });
          }
        };
        resolve([err, data, acknowledge]);
      });
    });
  }
}
