package __fragment_package__;

import __core_package__.BasicNode;

public interface BasicFragmentNode extends BasicNode {
	
	/***
	 * RAML fragment which owns the node
	 */
	Fragment fragment();

}
