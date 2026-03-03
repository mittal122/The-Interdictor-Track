import { CloudTrailClient, LookupEventsCommand } from '@aws-sdk/client-cloudtrail';
import { config } from 'dotenv';
config();

async function run() {
    const client = new CloudTrailClient({ region: 'us-east-1' });
    try {
        const res = await client.send(new LookupEventsCommand({
            MaxResults: 10,
            LookupAttributes: [
                { AttributeKey: 'ReadOnly', AttributeValue: 'false' }
            ]
        }));
        console.log('Found:', res.Events?.length);
    } catch (e: any) {
        console.error(e.name, e.message);
    }
}
run();
