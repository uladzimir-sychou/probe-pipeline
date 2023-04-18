import * as cdk from 'aws-cdk-lib';
import { ProbeStack } from '../lib/probe-stack';

const app = new cdk.App();
new ProbeStack(app, 'ProbePipelineStack', {
  env: {
    account: '111111111111441643927438',
    region: 'us-east-2',
  }
});

app.synth();