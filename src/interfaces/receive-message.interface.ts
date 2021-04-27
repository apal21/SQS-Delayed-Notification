import { SQS } from 'aws-sdk';

export default interface ReceiveMessageInterface {
  level: number;
  queueConfig: SQS.ReceiveMessageRequest;
}
