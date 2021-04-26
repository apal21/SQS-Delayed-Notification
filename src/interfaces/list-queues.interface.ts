import { SQS } from 'aws-sdk';

export default interface ListQueuesInterface {
  queueConfig: SQS.ListQueuesRequest;
}
