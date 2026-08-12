namespace plugin.langgraph.persistence;

using {
    StoreItem,
    StoreItemField
} from '../..';

entity StoreItems : StoreItem {
    fields : Composition of many StoreItemFields
                 on fields.item = $self;
}

entity StoreItemFields : StoreItemField {
    item      : Association to StoreItems
                    on  item.graphName = $self.graphName
                    and item.namespace = $self.namespace
                    and item.id        = $self.id;
    embedding : Vector(1536); // IMPORTANT: The field name must be "embedding". // NOTE: configure the embedding size based on the model used for generating embeddings
}
