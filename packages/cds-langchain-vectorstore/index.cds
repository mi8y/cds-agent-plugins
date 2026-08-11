aspect VectorDocument {
    key storeName   : String(256);
    key id          : String(256);
        pageContent : LargeString;
        embedding   : Vector;
}

aspect VectorDocumentMetadata {
    key name  : String(256);
        value : String(256);
}
