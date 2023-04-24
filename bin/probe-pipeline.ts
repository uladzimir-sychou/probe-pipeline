#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdPipelineStack } from '../lib/cd-shell-pipeline-stack';

const app = new cdk.App();
new CdPipelineStack(app, 'CdShellPipelineStack', {
  env: {
    account: '441643927438',
    region: 'us-east-2',
  }
});

app.synth();