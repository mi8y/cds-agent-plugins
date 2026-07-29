namespace plugin.langchain.vectorstore;

using {managed} from '@sap/cds/common';

entity Documents : managed {
    key storeName   : String(256);
    key id          : String(256);
        pageContent : LargeString;
        embedding   : Vector;
        metadata    : Composition of many DocumentMetadata
                          on metadata.document = $self;
}

entity DocumentMetadata {
    key document : Association to Documents;
    key name     : String(256);
        value    : String(256);
}
