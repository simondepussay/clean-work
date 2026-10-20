// Infrastructure Shukatsu Pilot (S01) : les ressources seulement.
// Les réglages de l'API (Cosmos, annuaire, secret de suppression) sont posés par
// infra/settings.mjs et infra/identity.mjs, qui les ajoutent sans écraser les autres :
// un bloc « appsettings » ici remplacerait tout à chaque déploiement, secret compris.
// Régions limitées par la politique de l'abonnement (Azure for Students) :
// Japon interdit → Cosmos DB en Corée Centre, Static Web Apps en Asie de l'Est (pas proposé en Corée).

@description('Région des données (Cosmos DB)')
param dataLocation string = 'koreacentral'

@description('Région de Static Web Apps (le service n\'existe que dans quelques régions)')
param webLocation string = 'eastasia'

@description('Suffixe unique pour les noms globaux')
param suffix string = uniqueString(resourceGroup().id)

var databaseName = 'shukatsu'
// Toutes les données sont partitionnées par utilisateur (voir api/src/lib/models.ts).
var containerNames = [ 'profiles', 'applications', 'drafts', 'reviews', 'usage' ]
var tags = { project: 'shukatsu-pilot' }

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: 'cosmos-shukatsu-${suffix}'
  location: dataLocation
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    // Serverless : facturé à la requête, rien quand personne n'utilise l'app.
    capabilities: [ { name: 'EnableServerless' } ]
    locations: [ { locationName: dataLocation, failoverPriority: 0 } ]
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    minimalTlsVersion: 'Tls12'
    backupPolicy: {
      type: 'Periodic'
      periodicModeProperties: { backupIntervalInMinutes: 240, backupRetentionIntervalInHours: 8, backupStorageRedundancy: 'Local' }
    }
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: cosmos
  name: databaseName
  properties: { resource: { id: databaseName } }
}

resource containers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = [for name in containerNames: {
  parent: database
  name: name
  properties: {
    resource: {
      id: name
      partitionKey: { paths: [ '/userId' ], kind: 'Hash' }
      // TTL activé sans durée par défaut : seuls les documents qui portent un « ttl »
      // (compte supprimé, S25) sont effacés par Cosmos DB à l'échéance.
      defaultTtl: -1
    }
  }
}]

resource web 'Microsoft.Web/staticSites@2024-04-01' = {
  name: 'swa-shukatsu-${suffix}'
  location: webLocation
  tags: tags
  sku: { name: 'Free', tier: 'Free' }
  properties: {}
}

// Relecture des ES par IA (S14). « GlobalStandard » est le seul type de déploiement proposé
// en Corée Centre pour ce modèle : les textes peuvent être traités dans n'importe quelle région
// d'Azure (à indiquer dans la politique de confidentialité, S04).
resource ai 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'oai-shukatsu-${suffix}'
  location: dataLocation
  tags: tags
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: 'oai-shukatsu-${suffix}'
    publicNetworkAccess: 'Enabled'
  }
}

resource reviewModel 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: ai
  name: 'review'
  sku: { name: 'GlobalStandard', capacity: 20 }
  properties: {
    model: { format: 'OpenAI', name: 'gpt-5-mini', version: '2025-08-07' }
  }
}

output webName string = web.name
output webHostname string = web.properties.defaultHostname
output cosmosName string = cosmos.name
output aiName string = ai.name
output aiEndpoint string = ai.properties.endpoint
