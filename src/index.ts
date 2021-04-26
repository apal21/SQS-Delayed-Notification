import { AWSError, SQS } from 'aws-sdk';
import CreateQueuesInterface from './interfaces/create-queues.interface';
import ListQueuesInterface from './interfaces/list-queues.interface';

export default class SQSWrapper {
  private sqs: SQS;

  private awsConfig: SQS.ClientConfiguration;

  private awsAccountId: string;

  private projectName: string;

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
      queueConfig[i].QueueName = `${this.projectName}-webhook-level-${i}`;

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
          }:${this.projectName}-webhook-level-${i + 1}`,
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
    queueConfig.QueueNamePrefix = `${this.projectName}-webhook`;

    return new Promise((resolve) => {
      this.sqs.listQueues(queueConfig, (err, data) => {
        resolve([err, data]);
      });
    });
  }
}
