const canonicalHost = "ai-stg-node02.serv.net.mx";
const legacyHosts = ["192.168.5.169", "201.150.35.186"];

for (const deployment of db.deployments.find({})) {
  let baseUrl = deployment.baseUrl;
  for (const legacyHost of legacyHosts) {
    baseUrl = baseUrl.replace(`https://${legacyHost}:`, `https://${canonicalHost}:`);
  }

  if (baseUrl !== deployment.baseUrl) {
    db.deployments.updateOne(
      { _id: deployment._id },
      { $set: { baseUrl, updatedAt: new Date() } }
    );
  }
}

printjson(db.deployments.find({}, { label: 1, baseUrl: 1, status: 1 }).toArray());
