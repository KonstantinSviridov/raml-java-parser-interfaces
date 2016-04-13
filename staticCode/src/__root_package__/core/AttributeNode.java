package __root_package__.model.core;

public interface AttributeNode extends AbstractWrapperNode{

	
    /***
     * @return Whether the element is an optional sibling of trait or resource type
     **/
    boolean optional();
    
    /***
     * @return Node metadata
     **/
    ValueMetadata meta();
}
