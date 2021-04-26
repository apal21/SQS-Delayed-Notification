import { SQS } from 'aws-sdk';

export default interface CreateQueuesInterface {
  queueConfig: SQS.CreateQueueRequest[];
}
