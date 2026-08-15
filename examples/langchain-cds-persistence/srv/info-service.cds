using {plugin.langgraph.persistence as lp} from '../db/langgraph-checkpointer';

service InfoService {
  entity Books {
    key ID     : Integer;
        title  : String;
        author : String;
  }

  entity Checkpoints as projection on lp.Checkpoints;
}
