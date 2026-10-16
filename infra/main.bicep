// Infrastructure Shukatsu Pilot (S01).
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
var containerNames = [ 'profiles', 'applications', 'drafts', 'reviews' ]
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

// Réglages lus par l'API (fonctions intégrées à Static Web Apps).
resource webSettings 'Microsoft.Web/staticSites/config@2024-04-01' = {
  parent: web
  name: 'appsettings'
  properties: {
    COSMOS_ENDPOINT: cosmos.properties.documentEndpoint
    COSMOS_KEY: cosmos.listKeys().primaryMasterKey
    COSMOS_DATABASE: databaseName
  }
}

output webName string = web.name
output webHostname string = web.properties.defaultHostname
output cosmosName string = cosmos.name
