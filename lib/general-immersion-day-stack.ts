// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

// Permission is hereby granted, free of charge, to any person obtaining a copy of this
// software and associated documentation files (the "Software"), to deal in the Software
// without restriction, including without limitation the rights to use, copy, modify,
// merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
// PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
// HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as elb,
  aws_autoscaling as scale,
  aws_rds as rds,
  aws_iam as iam,
  aws_secretsmanager as sm,
} from 'aws-cdk-lib';



export class GeneralImmersionDayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // AWS General Immersion Day
    // Section Advanced Modules - Network - Amazon VPC

    const vpc = new ec2.Vpc(this, 'ImmersionDay',
    {
      vpcName: 'ImmersionDayVPC',
      cidr: '10.0.0.0/16',
      natGateways: 2,
      subnetConfiguration: [
        {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
          name: 'Private',
        },
        {
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
          name: 'Public',
        }
      ]
    })

    // AWS General Immersion Day
    // Section Advanced Modules - Amazon EC2

    const lbSecurityGroup = new ec2.SecurityGroup(this, 'ALBSecurityGroup',
    {
      vpc,
      securityGroupName: 'ImmersionDayALBSG',
    })

    lbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80))

    const instanceSecurityGroup = new ec2.SecurityGroup(this, 'InstanceSecurityGroup',
    {
      vpc,
      securityGroupName: 'ImmersionDayInstanceSG'
    })

    instanceSecurityGroup.addIngressRule(ec2.Peer.securityGroupId(lbSecurityGroup.securityGroupId), ec2.Port.tcp(80))

    const instanceRole = new iam.Role(this, 'InstanceRole',
    {
      roleName: 'ImmersionDayInstanceRole',
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    })

    const launchTemplate = new ec2.LaunchTemplate(this, 'AutoscaleTemplate',
    {
      machineImage: ec2.MachineImage.genericLinux({'eu-west-1': 'ami-0198c8ba2ab3402a6'}),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      securityGroup: instanceSecurityGroup,
      role:instanceRole
    })

    const scalingGroup = new scale.AutoScalingGroup(this, 'InstanceAutoScale',
    {
      vpc,
      launchTemplate,
      maxCapacity: 1
    })

    const targetGroup = new elb.ApplicationTargetGroup(this, 'TargetGroup',
    {
      vpc,
      targetGroupName: 'ImmersionDayTG',
      targetType: elb.TargetType.INSTANCE,
      targets: [scalingGroup],
      port: 80
    })

    const loadBalancer = new elb.ApplicationLoadBalancer(this, 'LoadBalancer',
    {
      vpc,
      loadBalancerName: 'ImmersionDayALB',
      securityGroup: lbSecurityGroup,
      internetFacing: true
    })

    new elb.ApplicationListener(this, 'Lister',
    {
      port: 80,
      loadBalancer,
      defaultTargetGroups: [targetGroup]
    })

    // AWS General Immersion Day
    // Section Advanced Modules - Amazon Aurora

    // Database security group for Aurora databasae
    const databaseSecurityGroup = new ec2.SecurityGroup(this, 'AuroraSecurityGroup',
    {
      vpc,
      securityGroupName: 'ImmersionDayAuroraSG'
    })

    // Allow connections from autoscaling group instances on port 3306
    databaseSecurityGroup.addIngressRule(ec2.Peer.securityGroupId(instanceSecurityGroup.securityGroupId), ec2.Port.tcp(3306))

    // AWS Secrets manager secret to hold database user/password and connection information that can be queried from services connecting to database.
    const secret = new rds.DatabaseSecret(this, 'tests', {
      secretName: 'mysecret',
      username: 'awsuser'
    })

    // Allow autoscaling group instances to read the secret
    secret.grantRead(instanceRole)

    // Aurora database cluster
    const cluster = new rds.DatabaseCluster(this, 'Database', {
      engine: rds.DatabaseClusterEngine.auroraMysql({ version: rds.AuroraMysqlEngineVersion.VER_2_08_1 }),
      credentials: rds.Credentials.fromSecret(secret),
      defaultDatabaseName: 'immersionday',
      instanceProps: {
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE2, ec2.InstanceSize.SMALL),
        vpcSubnets: vpc.selectSubnets({subnetGroupName: 'Private'}),
        vpc,
        securityGroups: [databaseSecurityGroup]
      },
    });

  }
}