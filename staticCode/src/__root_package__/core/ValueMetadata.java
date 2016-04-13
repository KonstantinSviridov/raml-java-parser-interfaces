package __root_package__.model.core;

public interface ValueMetadata {

	/**
     * Returns 'true', if the actual value is missing, and returned value has
     * been obtained from the RAML document by means of some rule.  
     */
	boolean calculated();

	/**
     * Returns 'true', if the actual value is missing, and returned value is
     * stated in the RAML spec as default for the property
     */
	boolean insertedAsDefault();

	/**
     * Returns 'true' for optional siblings of traits and resource types
     */
	boolean optional();

	/**
     * Returns 'true', if the instance contains no positive information about the value.
     */
	boolean emptyMeta();

}
