export interface DeploymentState {
    envs: {
        dev: Env;
        qa: Env;
        stage: Env;
        prod: Env;
    };
}
interface Env {
    lambdaFunctions?: LambdaFunction[]
}
interface LambdaFunction {
    name: string;
    artifact: string;
    entry: string;
}

