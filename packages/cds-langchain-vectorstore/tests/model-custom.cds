namespace my.custom.vectorstore;

using {managed} from '@sap/cds/common';
using {
    VectorDocument,
    VectorDocumentMetadata
} from '..';

entity CustomDocuments : managed, VectorDocument {
    embedding  : Vector(3072);
    attributes : Composition of many CustomDocumentMetadata
                     on attributes.document = $self;
}

entity CustomDocumentMetadata : VectorDocumentMetadata {
    document : Association to CustomDocuments;
}
