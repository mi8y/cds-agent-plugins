aspect VectorDocument {
    key storeName   : String(256);
    key documentId  : String(256);
        pageContent : LargeString;
        embedding   : Vector;
}

aspect VectorDocumentMetadata {
    key storeName  : String(256);
    key documentId : String(256);
    key name       : String(256);
        value      : String(256);
}
