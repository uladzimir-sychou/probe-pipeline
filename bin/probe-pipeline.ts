#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdPipelineStack } from '../lib/probe-pipeline-stack';

const app = new cdk.App();
new CdPipelineStack(app, 'CdPipelineStack', {
  env: {
    account: '441643927438',
    region: 'us-east-2',
  }
});

app.synth();