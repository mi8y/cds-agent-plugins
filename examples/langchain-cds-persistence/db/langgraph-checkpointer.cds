namespace plugin.langgraph.persistence;

using {
    Checkpoint,
    CheckpointWrite
} from '@mi8y/cds-langgraph-persistence';

entity Checkpoints : Checkpoint {
    writes : Composition of many CheckpointWrites
                 on writes.checkpoint = $self;
}

entity CheckpointWrites : CheckpointWrite {
    checkpoint : Association to Checkpoints
                     on  checkpoint.graphName = $self.checkpoint_graphName
                     and checkpoint.namespace = $self.checkpoint_namespace
                     and checkpoint.threadId  = $self.checkpoint_threadId
                     and checkpoint.id        = $self.checkpoint_id;
}
