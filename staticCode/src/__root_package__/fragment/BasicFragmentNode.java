package __root_package__.model.fragment;

import __root_package__.model.core.BasicNode;

public interface BasicFragmentNode extends BasicNode {
	
	/***
	 * RAML fragment which owns the node
	 */
	Fragment fragment();

}
