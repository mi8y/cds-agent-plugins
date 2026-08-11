namespace my.custom.vectorstore;

using {managed} from '@sap/cds/common';
using {
    VectorDocument,
    VectorDocumentMetadata
} from '..';

entity CustomDocuments : managed, VectorDocument {
    embedding : Vector(3072);
    metadata  : Composition of many CustomDocumentMetadata
                    on metadata.document = $self;
}

entity CustomDocumentMetadata : VectorDocumentMetadata {
    key document : Association to CustomDocuments;
}
