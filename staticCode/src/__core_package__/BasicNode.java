package __core_package__;

import java.util.List;

public interface BasicNode extends AbstractWrapperNode{

    /***
     * @return Direct ancestor in RAML hierarchy
     **/
	BasicNode parent();
    
    Object toJSON();
    
    /**
     * @return For siblings of traits or resource types returns a list of optional properties names.
     **/
    List<String> optionalProperties();
    
    /***
     * @return Whether the element is an optional sibling of trait or resource type
     **/
    boolean optional();
    
    /***
     * @return Metadata of the node itself and its scalara properties
     **/
    NodeMetadata meta();
}
