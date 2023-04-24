
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { load as original } from 'js-yaml';
import { DeploymentState } from '../deployment-state/deployment-state';

let deploymentState: DeploymentState = require('../deployment-state/deployment-state.json');

export class CdPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    console.log(deploymentState);
    // Define the S3 bucket where the Lambda function zip file is located
    const bucket = s3.Bucket.fromBucketArn(this, 'ArtifactBucket', 'arn:aws:s3:::artifactory-s3-bucket-1681906290');


    const lambdas = deploymentState.envs.dev.lambdaFunctions ? deploymentState.envs.dev.lambdaFunctions : [];
    const desiredLambda = lambdas[0];
    const lambda_function_artifact_name = desiredLambda.artifact;

    console.log(`Lambda ${desiredLambda}; name ${lambda_function_artifact_name}`);

    // Define the Lambda function
    const lambdaFunction = new lambda.Function(this, 'GreetingLambda-simplified', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: desiredLambda.entry,
      code: lambda.Code.fromBucket(bucket, lambda_function_artifact_name),
      functionName: desiredLambda.name,
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
    const pipeline = new codepipeline.Pipeline(this, 'CdGitOpsPipeline-simplified', {
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
      bucketKey: lambda_function_artifact_name,
      output: sourceOutput,
    });

    // Add the deploy action to the pipeline
    // const deployAction = new codepipelineActions.CloudFormationCreateUpdateStackAction({
    //   actionName: 'Deploy',
    //   stackName: 'MyLambdaStack',
    //   templatePath: sourceOutput.atPath('cdk.out/GreetingLambdaStack.template.json'),
    //   parameterOverrides: {
    //     LambdaFunctionName: lambdaFunction.functionName,
    //     LambdaFunctionCodeBucket: bucket.bucketName,
    //     LambdaFunctionCodeKey: lambda_function_artifact_name,
    //   },
    //   extraInputs: [sourceOutput],
    //   adminPermissions: true
    // });


    // Create a CodeBuild project to deploy the Lambda function
    const buildOutput = new codepipeline.Artifact();
    const buildProject = new codebuild.PipelineProject(this, 'CdLambdaBuildProject', {
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              'metadata_url="http://169.254.170.2$(echo $AWS_CONTAINER_CREDENTIALS_RELATIVE_URI)"',
              'creds=$(curl --silent $metadata_url)',
              `access_key=$(echo $creds | jq -r '.AccessKeyId')`,
              `secret_key=$(echo $creds | jq -r '.SecretAccessKey')`,
              'aws_access_key_id=$access_key',
              'aws_secret_access_key=$secret_key',
              'echo aws_access_key_id $aws_access_key_id',
              'echo aws_secret_access_key $aws_secret_access_key',
              'sudo yum install aws-cli',
              'printenv',
              'aws lambda update-function-code --function-name $FN_NAME --s3-bucket $S3_BUCKET --s3-key $S3_BUCKET_KEY'
            ],
          },
        },
        artifacts: {
          files: [
            'lambda-function-v0.0.*.zip'
          ]
        },
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
      },
    });

    buildProject.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: [lambdaFunction.functionArn],
      actions: ['lambda:UpdateFunctionCode', 'lambda:UpdateFunctionConfiguration'],
    }));

    const buildAction = new codepipelineActions.CodeBuildAction({
      actionName: 'Build',
      project: buildProject,
      input: sourceOutput,
      outputs: [buildOutput],
      environmentVariables: {
        FN_NAME: { value: 'GreetingLambda-simplified' },
        S3_BUCKET: { value: 'artifactory-s3-bucket-1681906290' },
        S3_BUCKET_KEY: { value: 'lambda-function-v0.0.1ddb1291e27e267dfad6827575e1397034897682.zip' }
      }
    });


    // Add the stages to the pipeline
    pipeline.addStage({
      stageName: 'Source',
      actions: [pipelineSourceAction, sourceAction],
    });

    // pipeline.addStage({
    //   stageName: 'Build',
    //   actions: [buildAction],
    // });

    pipeline.addStage({
      stageName: 'Buildeploy',
      actions: [buildAction],
    });

  }
}