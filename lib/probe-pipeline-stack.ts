
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';


export class CdPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    // Define the S3 bucket where the Lambda function zip file is located
    const bucket = s3.Bucket.fromBucketArn(this, 'ArtifactBucket', 'arn:aws:s3:::artifactory-s3-bucket-1681906290');


    // Define the Lambda function
    const lambdaFunction = new lambda.Function(this, 'GreetingLambda', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromBucket(bucket, 'lambda-function-v0.0.1682085553068.zip'),
      functionName: 'GreetingLambda',
      timeout: cdk.Duration.seconds(10),
      memorySize: 512,
    });

    const pipelinePolicy = new iam.Policy(this, 'CdGitOpsPipelinePolicy', {
      policyName: 'CdGitOpsPipelinePolicy',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'codepipeline:CreatePipeline',
            'codepipeline:DeletePipeline',
            'codepipeline:GetPipeline',
            'codepipeline:GetPipelineState',
            'codepipeline:ListPipelines',
            'codepipeline:StartPipelineExecution',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'lambda:CreateFunction',
            'lambda:DeleteFunction',
            'lambda:GetFunction',
            'lambda:GetFunctionConfiguration',
            'lambda:InvokeFunction',
            'lambda:ListFunctions',
            'lambda:UpdateFunctionCode',
          ],
          resources: ['*'],
        }),
      ],
    });
    
    const pipelineRole = new iam.Role(this, 'CdGitOpsPipelineRole', {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('codepipeline.amazonaws.com'),
        new iam.AccountPrincipal(this.account),
      ),
    });
    
    pipelineRole.attachInlinePolicy(pipelinePolicy);

    const s3SourceCodeRole = new iam.Role(this, 'CdGitOpsPipelineSourceS3SourceCode', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });

    bucket.grantRead(s3SourceCodeRole);
    
    s3SourceCodeRole.addToPolicy(new iam.PolicyStatement({
      resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
      actions: ['s3:GetObject'],
    }));

    // Grant the pipeline role permission to assume the S3 source code role
    pipelineRole.addToPolicy(new iam.PolicyStatement({
      resources: [s3SourceCodeRole.roleArn],
      actions: ['sts:AssumeRole'],
    }));



    // Define the CodePipeline
    const pipeline = new codepipeline.Pipeline(this, 'CdGitOpsPipeline', {
      role: pipelineRole
    });

    
    const pipelineSourceOutput = new codepipeline.Artifact();
    const pipelineSourceAction = new codepipelineActions.GitHubSourceAction({
      actionName: 'Checkout',
      owner: 'uladzimir-sychou',
      repo: 'probe-pipeline',
      branch: 'main',
      output: pipelineSourceOutput,
      oauthToken: cdk.SecretValue.secretsManager('github-token')
    });

    // Add the S3 source action to the pipeline
    const sourceOutput = new codepipeline.Artifact();
    const sourceAction = new codepipelineActions.S3SourceAction({
      actionName: 'S3Source',
      bucket: bucket,
      bucketKey: 'lambda-function-v0.0.1682085553068.zip',
      output: sourceOutput,
    });

    // Add the deploy action to the pipeline
    const deployAction = new codepipelineActions.CloudFormationCreateUpdateStackAction({
      actionName: 'Deploy',
      stackName: 'MyLambdaStack',
      templatePath: sourceOutput.atPath('template.yaml'),
      parameterOverrides: {
        LambdaFunctionName: lambdaFunction.functionName,
        LambdaFunctionCodeBucket: bucket.bucketName,
        LambdaFunctionCodeKey: 'lambda-function-v0.0.1682085553068.zip',
      },
      extraInputs: [sourceOutput],
      adminPermissions: true
    });

    // Add the stages to the pipeline
    pipeline.addStage({
      stageName: 'Source',
      actions: [pipelineSourceAction, sourceAction],
    });

    pipeline.addStage({
      stageName: 'Deploy',
      actions: [deployAction],
    });

  }
}